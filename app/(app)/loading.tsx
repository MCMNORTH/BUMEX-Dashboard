import { VanguardLoading } from "@/components/vanguard/vanguard-loading";

// While the server answers: the app as it comes, drawn as skeletons in Vanguard's frame (vanguard-loading.tsx), until
// the page is there.
export default function Loading() {
  return <VanguardLoading />;
}
