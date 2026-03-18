import FounderConsole from "@/components/founder-console/FounderConsole"
import { requireFounderPageAccess } from "@/lib/founder-console/auth"

export default async function Page() {
  await requireFounderPageAccess("/founder")

  return <FounderConsole />
}
