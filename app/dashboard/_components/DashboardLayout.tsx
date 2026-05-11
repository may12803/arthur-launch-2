"use client";

import React from "react";

export function DashboardLayout({
  left,
  right,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-black text-gray-300">
      <div className="w-2/3 p-8 flex flex-col">
        {left}
      </div>
      <div className="w-1/3 bg-gray-900/50 border-l border-gray-800 p-8">
        {right}
      </div>
    </div>
  );
}
