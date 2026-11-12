import { permanentRedirect } from "next/navigation";

// The tour used to live here; it is the home page now.
export default function Page() {
  permanentRedirect("/");
}
