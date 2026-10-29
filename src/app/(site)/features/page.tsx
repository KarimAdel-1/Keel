import { redirect } from "next/navigation";

/** Every feature is listed, stage by stage, on the product overview; this address goes there. */
export default function FeaturesPage() {
  redirect("/product");
}
