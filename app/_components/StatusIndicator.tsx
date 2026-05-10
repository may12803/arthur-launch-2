"use client";

import { useState, useEffect } from "react";

const StatusIndicator = () => {
  const [status, setStatus] = useState("pending");

  useEffect(() => {
    // In a real application, you would fetch the status from an API
    const interval = setInterval(() => {
      const statuses = ["pending", "in-progress", "complete", "error"];
      const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
      setStatus(randomStatus);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = () => {
    switch (status) {
      case "pending":
        return "bg-yellow-500";
      case "in-progress":
        return "bg-blue-500";
      case "complete":
        return "bg-green-500";
      case "error":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
      <span className="text-xs text-gray-400">{`Arthur: ${status}`}</span>
    </div>
  );
};

export default StatusIndicator;
