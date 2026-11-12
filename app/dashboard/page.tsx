import type { Metadata, Viewport } from "next";
import TrancheApp from "@/components/shell/TrancheApp";

export const metadata: Metadata = {
  title: "Tranche dashboard",
};

// The dashboard is a desktop layout (at least 1100px wide). On a phone, show the whole of it
// scaled to fit the screen, instead of a page that runs off the right edge. Pinch to zoom in.
export const viewport: Viewport = {
  width: 1100,
  initialScale: undefined,
};

export default function Page() {
  return <TrancheApp />;
}
