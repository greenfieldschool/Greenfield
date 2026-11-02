# Bank alerts: automatic payment matching

Parents pay by bank transfer and write two things in the transfer description:

```
<child's admission number>  <payment ID>          e.g.   GRE/2026/447 SF
```

- The **payment ID** is the short code of what they are paying for (SF = School fees, UNI = Uniform ...).
  Set them in **Finance > Fees > Fee types & payment IDs**. An invoice number (`INV-2026-00012`) also works.
- Each child's invoice page and the parent's Fees & billing page show the exact text to write.

When the bank's money-received email or monthly statement comes in, the app finds the admission number and the
payment ID, lines the payment up with the child's unpaid invoice, and records it.

## Two ways in

1. **Monthly statement (manual, no setup).** Finance > Payments > *Bank statement & alerts*. Upload the CSV the bank
   gives you (or paste the rows), press *Read and match*. Sure matches are recorded, the rest wait for you.
2. **Email alerts (automatic).** Forward each bank credit alert to the app. Needs the setup below.

Either way, a payment is only recorded once: the same line (date, amount, description, reference) is never added twice.

## Setting up email alerts (one time)

1. Run `docs/migrations/20261101_payment_ids_bank_inbox.sql` in the Supabase SQL editor.
2. In Vercel > Project > Settings > Environment Variables add `BANK_ALERT_SECRET` = a long random string
   (for example the output of `openssl rand -hex 24`). Redeploy.
   Optional: `BANK_ALERT_AUTO_RECORD=false` makes every alert wait for a person instead of recording the sure ones.
3. In the Gmail account that receives the bank's alerts, create the Google Apps Script below
   (script.google.com > New project), paste your secret, press Run once to give it permission, then add a trigger:
   *Triggers > Add trigger > forwardBankAlerts > Time-driven > every 5 minutes*.

```js
const SECRET = "PASTE_BANK_ALERT_SECRET_HERE";
const URL = "https://greenfieldschool.ng/api/finance/bank-alert";
// Change to the sender / subject the bank really uses (look at one alert email).
const SEARCH = 'from:(alerts@yourbank.com) subject:(credit) -label:gf-sent newer_than:2d';

function forwardBankAlerts() {
  const label = GmailApp.getUserLabelByName("gf-sent") || GmailApp.createLabel("gf-sent");
  GmailApp.search(SEARCH, 0, 30).forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      const res = UrlFetchApp.fetch(URL, {
        method: "post",
        contentType: "application/json",
        headers: { "x-bank-alert-secret": SECRET },
        payload: JSON.stringify({ text: msg.getPlainBody(), message_id: msg.getId() }),
        muteHttpExceptions: true
      });
      if (res.getResponseCode() === 200) thread.addLabel(label);
    });
  });
}
```

Test it by sending the endpoint an alert yourself:

```bash
curl -X POST https://greenfieldschool.ng/api/finance/bank-alert \
  -H "x-bank-alert-secret: $BANK_ALERT_SECRET" -H "content-type: application/json" \
  -d '{"text":"Credit Alert\nAmount: NGN 40,000.00\nNarration: GRE/2026/447 SF\nDate: 30-Oct-2026"}'
```

## What counts as a sure match

Recorded without a person only when **all** of these hold:

- the description has a known admission number (or an invoice number),
- and a payment ID that matches an unpaid invoice of that child (or the invoice number itself),
- and the amount is not more than what is still owed on that invoice.

Everything else (no payment ID, two children named, amount too big, unknown child) goes to the inbox with a note saying why.
Bank alert wording differs between banks. The reader looks for *Amount*, *Narration/Description/Remarks*, *Date* and
*Reference* labels; if your bank uses other words, send one example alert so the labels can be added.
