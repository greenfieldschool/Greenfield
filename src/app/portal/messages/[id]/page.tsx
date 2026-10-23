import { ConversationView } from "@/components/chat/pages";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConversationView base="/portal/messages" id={id} />;
}
