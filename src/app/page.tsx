import { StoreProvider } from "@/lib/store";
import Shell from "@/components/Shell";

export default function Home() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
