"use client";

import dynamic from "next/dynamic";

const FuelMap = dynamic(() => import("@/components/FuelMap"), { ssr: false });

export default function FuelMapLoader() {
  return <FuelMap />;
}
