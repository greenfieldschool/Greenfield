import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import UrlToast from "@/components/url-toast";
import { LEARN } from "@/lib/learn-guides";
import { listBanks, paystackConfigured } from "@/lib/paystack";
import { spendingError, type SpendingKind } from "@/lib/spending";
import { RequestForm, type CategoryFigure, type PayeeOption } from "../_request-form";
import { saveRequestAction } from "../actions";

// Ask for money (or change a request that was sent back: ?edit=<id>).

type SP = { edit?: string; toast?: string };

export default async function NewSpendingRequestPage({ searchParams }: { searchParams?: SP }) {
  const sp = searchParams ?? {};
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const editId = /^[0-9a-f-]{36}$/i.test(sp.edit ?? "") ? sp.edit! : null;
  const [figuresRes, payeesRes, banks, editRes] = await Promise.all([
    supabase.rpc("spending_category_figures"),
    supabase.from("spending_payees").select("id, kind, user_id, name, bank_name, bank_code, account_number, account_name").eq("active", true).order("name"),
    listBanks(),
    editId
      ? supabase.from("spending_requests").select("id, kind, status, requester_id, category_id, purpose, amount, needed_by, payee_id").eq("id", editId).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);

  const categories = ((figuresRes.data ?? []) as Array<{ category_id: string; name: string; budget: number | null; spent: number; committed: number }>).map(
    (c): CategoryFigure => ({ id: c.category_id, name: c.name, budget: c.budget == null ? null : Number(c.budget), spent: Number(c.spent), committed: Number(c.committed) })
  );
  const payees = (payeesRes.data ?? []) as Array<PayeeOption & { kind: string; user_id: string | null }>;
  const myAccount = payees.find((p) => p.kind === "staff" && p.user_id === auth.user!.id) ?? null;
  const suppliers = payees.filter((p) => p.kind === "supplier");
  const edit = editRes.data as null | {
    id: string;
    kind: SpendingKind;
    status: string;
    requester_id: string;
    category_id: string;
    purpose: string;
    amount: number;
    needed_by: string | null;
    payee_id: string;
  };
  const canEdit = edit && edit.status === "sent_back" && edit.requester_id === auth.user.id;

  return (
    <div className="space-y-6">
      <UrlToast key={sp.toast ?? "none"} />
      <PageHeader
        learn={LEARN.spending}
        back={{ href: edit ? `/admin/spending/${edit.id}` : "/admin/spending", label: edit ? "Back to the request" : "Back to spending requests" }}
        eyebrow="Spending requests"
        title={canEdit ? "Change and send again" : "Ask for money"}
        description="An approver is told straight away. You'll get an email at each step."
      />
      {figuresRes.error ? <Alert tone="warning">{spendingError(figuresRes.error.message)}</Alert> : null}
      {editId && !canEdit ? <Alert tone="warning">That request can only be changed after it has been sent back to you.</Alert> : null}
      {!categories.length && !figuresRes.error ? (
        <Alert tone="warning">There are no expense categories yet. Ask an admin to add them under Finance → Fee setup → Budget sectors.</Alert>
      ) : null}
      <Card>
        <CardBody>
          <RequestForm
            action={saveRequestAction}
            categories={categories}
            banks={banks}
            paystackOn={paystackConfigured()}
            myAccount={myAccount}
            suppliers={suppliers}
            initial={canEdit ? edit : null}
          />
        </CardBody>
      </Card>
    </div>
  );
}
