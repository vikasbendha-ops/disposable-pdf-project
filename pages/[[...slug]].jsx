import dynamic from "next/dynamic";

const LegacyApp = dynamic(() => import("../frontend/src/App"), {
  ssr: false,
});

export default function CatchAllPage() {
  return <LegacyApp />;
}
