#!/usr/bin/env python3
"""
One-time backfill for LexPerks referral tracking.

Mirrors the FIXED poller logic (src/routes/cron.js matchReferralByCode):
  - Pull every COMPLETED job since program launch from ServiceTitan.
  - For each job carrying a "Referred by Code" (custom field 406119323)
    that maps to a real referrer customer:
      * job total >= min_job_value  -> status 'completed', reward = 5% capped $250
      * job total <  min_job_value  -> status 'rejected'  (below threshold), reward 0
  - Insert/update the referral row idempotently (dedup by referred_job_id,
    then by referrer_id+referred_st_id), bump referrer total_referrals /
    total_rewards, and log a referral.matched job_event.

Promo/marketing codes (COOL CLUB MEMBER, SPRING99, etc.) that don't map to a
6-char referrer code are skipped. Jobs not in Completed status are left alone.

Usage:
  python3 backfill-referrals.py            # DRY RUN (no writes)
  python3 backfill-referrals.py --commit   # execute writes
"""
import sys, os, re, json, time
import requests

DRY = '--commit' not in sys.argv
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
REFERRED_BY_FIELD = 406119323
LAUNCH = "2026-05-01T00:00:00Z"

def read_env(path, key):
    for line in open(path):
        s = line.strip()
        if s.startswith(key + "=") and not s.startswith("#"):
            return s.split("=", 1)[1].strip().strip('"').strip("'")
    return None

# ── Credentials ──
HE = "/workspace/.secrets/hermes.env"
ST_CID = read_env(HE, "SERVICETITAN_CLIENT_ID")
ST_SEC = read_env(HE, "SERVICETITAN_CLIENT_SECRET")
ST_APP = read_env(HE, "SERVICETITAN_APP_KEY")
TENANT = read_env(HE, "SERVICETITAN_TENANT_ID")

SB = "/workspace/apps/lex-servicetitan-reporting/secrets/lexperks_supabase.env"
SURL = read_env(SB, "SUPABASE_URL")
SKEY = read_env(SB, "SUPABASE_SERVICE_KEY")

BASE = "https://api.servicetitan.io"

def st_token():
    r = requests.post("https://auth.servicetitan.io/connect/token",
        data={'grant_type':'client_credentials','client_id':ST_CID,'client_secret':ST_SEC},
        headers={'Content-Type':'application/x-www-form-urlencoded','User-Agent':UA}, timeout=30)
    r.raise_for_status()
    return r.json()['access_token']

TOK = st_token()
ST = requests.Session()
ST.headers.update({'Authorization':f'Bearer {TOK}','ST-App-Key':ST_APP,'User-Agent':UA,'Accept':'application/json'})

SBH = {'apikey':SKEY,'Authorization':f'Bearer {SKEY}','Content-Type':'application/json','User-Agent':UA}
def sb_get(path):
    r = requests.get(f"{SURL}/rest/v1/{path}", headers=SBH, timeout=30); r.raise_for_status(); return r.json()
def sb_patch(path, body):
    h = dict(SBH); h['Prefer']='return=representation'
    r = requests.patch(f"{SURL}/rest/v1/{path}", headers=h, data=json.dumps(body), timeout=30)
    r.raise_for_status(); return r.json()
def sb_post(path, body):
    h = dict(SBH); h['Prefer']='return=representation'
    r = requests.post(f"{SURL}/rest/v1/{path}", headers=h, data=json.dumps(body), timeout=30)
    r.raise_for_status(); return r.json()

def norm(c): return re.sub(r'[^A-Z0-9]','',(c or '').upper())
def title(s): return ' '.join(w[:1].upper()+w[1:].lower() for w in (s or '').split())

# ── Settings ──
settings = {row['key']: row['value'] for row in sb_get("system_settings?select=key,value")}
MIN = float(settings.get('min_job_value', '350'))
PCT = float(settings.get('payout_percentage', '5'))
CAP = float(settings.get('payout_cap', '250'))
print(f"Settings: min_job_value=${MIN}  payout={PCT}% cap ${CAP}  | MODE={'DRY-RUN' if DRY else 'COMMIT'}")

def payout(total):
    return round(min(total * PCT / 100.0, CAP), 2)

# ── Pull completed jobs in monthly windows (avoids 500-job cap) ──
from datetime import datetime, timezone, timedelta
def month_windows(start_iso):
    start = datetime.fromisoformat(start_iso.replace('Z','+00:00'))
    now = datetime.now(timezone.utc) + timedelta(days=1)
    cur = start
    while cur < now:
        nxt = (cur.replace(day=1) + timedelta(days=32)).replace(day=1)
        yield cur.strftime('%Y-%m-%dT%H:%M:%SZ'), min(nxt, now).strftime('%Y-%m-%dT%H:%M:%SZ')
        cur = nxt

coded_jobs = []
for w_start, w_end in month_windows(LAUNCH):
    page = 1
    while True:
        r = ST.get(f"{BASE}/jpm/v2/tenant/{TENANT}/jobs",
            params={'jobStatus':'Completed','completedOnOrAfter':w_start,'completedBefore':w_end,
                    'pageSize':200,'page':page}, timeout=60).json()
        d = r.get('data', [])
        for j in d:
            cf = j.get('customFields') or []
            rb = next((f for f in cf if f.get('typeId')==REFERRED_BY_FIELD and (f.get('value') or '').strip()), None)
            if rb:
                coded_jobs.append((j, rb['value']))
        if len(d) < 200: break
        page += 1
    print(f"  window {w_start[:7]}: scanned through page {page}")

print(f"\nCompleted jobs with a Referred-by code since launch: {len(coded_jobs)}")

# ── Classify + write ──
actions = []
for job, raw in coded_jobs:
    jid = str(job['id'])
    code = norm(raw)
    total = float(job.get('total') or 0)
    st_cust = str(job.get('customerId') or '')

    if not re.fullmatch(r'[A-Z0-9]{6}', code):
        actions.append(('skip-promo', jid, raw, total, None, None)); continue

    ref = sb_get(f"customers?referral_code=eq.{code}&select=id,name,total_referrals,total_rewards,payout_eligible")
    if not ref:
        actions.append(('skip-nocode', jid, raw, total, None, None)); continue
    referrer = ref[0]

    # friend name from ST
    friend = ''
    try:
        fc = ST.get(f"{BASE}/crm/v2/tenant/{TENANT}/customers/{st_cust}", timeout=30).json()
        friend = title(fc.get('name') or '')
    except Exception:
        pass

    ineligible = referrer.get('payout_eligible') is False
    below = total < MIN
    if ineligible:
        status, reward, reason = 'rejected', None, 'Referrer not eligible for payouts'
    elif below:
        status, reward, reason = 'rejected', None, f'Job total ${total} below minimum ${MIN}'
    else:
        status, reward, reason = 'completed', payout(total), None

    # Dedup: by job id first, then referrer+st_cust
    existing = sb_get(f"referrals?referred_job_id=eq.{jid}&select=id,status")
    if not existing:
        existing = sb_get(f"referrals?referrer_id=eq.{referrer['id']}&referred_st_id=eq.{st_cust}&select=id,status")

    action = {
        'jid': jid, 'code': code, 'referrer': referrer['name'], 'referrer_id': referrer['id'],
        'friend': friend, 'total': total, 'status': status, 'reward': reward, 'reason': reason,
        'existing_id': existing[0]['id'] if existing else None,
        'existing_status': existing[0]['status'] if existing else None,
    }

    if existing and existing[0]['status'] in ('completed','rewarded','rejected'):
        actions.append(('already-final', jid, raw, total, referrer['name'], action)); continue

    actions.append(('write', jid, raw, total, referrer['name'], action))

    if not DRY:
        body = {
            'status': status, 'referred_name': friend or None, 'referred_job_id': jid,
            'referred_st_id': st_cust, 'referred_job_value': total, 'reward_amount': reward,
            'tier_id': None,
        }
        if reason: body['rejection_reason'] = reason
        if action['existing_id']:
            sb_patch(f"referrals?id=eq.{action['existing_id']}", body)
        else:
            sb_post("referrals", {'referrer_id': referrer['id'], **body})
            # bump total_referrals
            fresh = sb_get(f"customers?id=eq.{referrer['id']}&select=total_referrals")
            cur = fresh[0]['total_referrals'] or 0
            sb_patch(f"customers?id=eq.{referrer['id']}", {'total_referrals': cur + 1})
        # bump total_rewards
        if reward:
            fresh = sb_get(f"customers?id=eq.{referrer['id']}&select=total_rewards")
            cur = float(fresh[0]['total_rewards'] or 0)
            sb_patch(f"customers?id=eq.{referrer['id']}", {'total_rewards': round(cur+reward,2)})
        # log event
        sb_post("job_events", {'st_job_id': jid, 'st_customer_id': st_cust,
            'event_type':'referral.matched',
            'payload':{'referredByCode':code,'referrerId':referrer['id'],'referredName':friend,
                       'jobTotal':total,'status':status,'payoutAmount':reward,
                       'source':'backfill','rejectionReason':reason},
            'processed': True})

# ── Report ──
print("\n=== BACKFILL PLAN ===")
tot_reward = 0.0
for kind, jid, raw, total, referrer, action in actions:
    if kind == 'write':
        tag = f"{action['status'].upper()}"
        rw = f" reward=${action['reward']}" if action['reward'] else " reward=$0"
        pre = f"(update {action['existing_status']}→)" if action['existing_id'] else "(new)"
        print(f"  WRITE {pre} job {jid} code={raw!r} -> {referrer} / {action['friend']!r} ${total} => {tag}{rw}")
        if action['reward']: tot_reward += action['reward']
    elif kind == 'already-final':
        print(f"  SKIP  job {jid} code={raw!r} -> {referrer}: already {action['existing_status']}")
    elif kind == 'skip-promo':
        print(f"  SKIP  job {jid} code={raw!r}: promo/marketing (not a 6-char referrer code)")
    elif kind == 'skip-nocode':
        print(f"  SKIP  job {jid} code={raw!r}: no matching referrer customer")

n_write = sum(1 for a in actions if a[0]=='write')
print(f"\n{'WOULD WRITE' if DRY else 'WROTE'} {n_write} referral row(s); total reward owed ${round(tot_reward,2)}")
if DRY:
    print("\nDRY RUN — no changes made. Re-run with --commit to apply.")
