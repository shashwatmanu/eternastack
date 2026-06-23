"use client";

import MainPage from "@/components/MainPage";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function PageContent() {
  const searchParams = useSearchParams();
  const [isTech] = useState(() => searchParams.get("tech") === "true");

  useEffect(() => {
    if (isTech) {
      window.history.replaceState({}, '', '/');
    }
  }, [isTech]);

  return <MainPage isTech={isTech} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PageContent />
    </Suspense>
  );
}
