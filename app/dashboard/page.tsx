import type { Metadata } from "next";
import TrancheApp from "@/components/shell/TrancheApp";

export const metadata: Metadata = {
  title: "Tranche dashboard",
};

export default function Page() {
  return <TrancheApp />;
}
