import { NewConversation } from "@/components/chat/pages";

export default async function NewMessagePage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  return <NewConversation base="/admin/messages" q={typeof sp.q === "string" ? sp.q : ""} />;
}
