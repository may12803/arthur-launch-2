"use client";
import { useEffect, useRef } from "react";

interface Point { i: number; score: number; }

export default function BenchChart({ points }: { points: Point[] }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || points.length < 2) return;
    // Dynamic import to avoid SSR issues
    import("d3").then(d3 => {
      const svg = d3.select(ref.current!);
      svg.selectAll("*").remove();

      const W = ref.current!.getBoundingClientRect().width || 340;
      const H = 80;
      const margin = { top: 10, right: 10, bottom: 20, left: 28 };
      const iw = W - margin.left - margin.right;
      const ih = H - margin.top - margin.bottom;

      const x = d3.scaleLinear().domain([1, points.length]).range([0, iw]);
      const y = d3.scaleLinear().domain([0, 1]).range([ih, 0]);

      const g = svg
        .attr("viewBox", `0 0 ${W} ${H}`)
        .attr("preserveAspectRatio", "none")
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

      // Area fill
      const area = d3.area<Point>()
        .x(d => x(d.i))
        .y0(ih)
        .y1(d => y(d.score))
        .curve(d3.curveMonotoneX);

      const defs = svg.append("defs");
      const grad = defs.append("linearGradient")
        .attr("id", "bench-grad")
        .attr("x1", "0").attr("y1", "0")
        .attr("x2", "0").attr("y2", "1");
      grad.append("stop").attr("offset", "0%").attr("stop-color", "#4ade80").attr("stop-opacity", 0.3);
      grad.append("stop").attr("offset", "100%").attr("stop-color", "#4ade80").attr("stop-opacity", 0);

      g.append("path")
        .datum(points)
        .attr("d", area)
        .attr("fill", "url(#bench-grad)");

      // Line
      const line = d3.line<Point>()
        .x(d => x(d.i))
        .y(d => y(d.score))
        .curve(d3.curveMonotoneX);

      g.append("path")
        .datum(points)
        .attr("d", line)
        .attr("fill", "none")
        .attr("stroke", "#4ade80")
        .attr("stroke-width", 1.5);

      // Dots on each point
      g.selectAll("circle")
        .data(points)
        .enter()
        .append("circle")
        .attr("cx", d => x(d.i))
        .attr("cy", d => y(d.score))
        .attr("r", 3)
        .attr("fill", "#4ade80");

      // Y axis ticks
      g.append("g")
        .call(d3.axisLeft(y).ticks(3).tickFormat(d => `${Math.round((d as number) * 100)}%`))
        .call(g2 => {
          g2.selectAll("text").attr("fill", "#515869").attr("font-size", 8);
          g2.select(".domain").remove();
          g2.selectAll(".tick line").attr("stroke", "#161b24");
        });
    });
  }, [points]);

  return <svg ref={ref} style={{ width: "100%", height: 80, overflow: "visible" }} />;
}
