import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface DonutChartProps {
  data: Record<string, number>;
  colors?: Record<string, string>;
}

const DonutChart: React.FC<DonutChartProps> = ({ data, colors }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = 200;
    const height = 200;
    const radius = Math.min(width, height) / 2;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.append('g').attr('transform', `translate(${width / 2}, ${height / 2})`);

    const pie = d3.pie<any>().value((d) => d.value);
    const arc = d3.arc<any>().innerRadius(radius * 0.6).outerRadius(radius);

    const formattedData = Object.entries(data).map(([key, value]) => ({ key, value }));
    const arcs = pie(formattedData);

    const colorScale = d3.scaleOrdinal()
      .domain(formattedData.map(d => d.key))
      .range(Object.values(colors || {
        'COMPLETED': '#10b981',
        'DRAFT': '#94a3b8',
        'IN_PROGRESS': '#3b82f6'
      }));

    g.selectAll('path')
      .data(arcs)
      .enter()
      .append('path')
      .attr('d', arc)
      .attr('fill', (d) => colorScale(d.data.key) as string)
      .attr('stroke', 'white')
      .attr('stroke-width', 2);

  }, [data, colors]);

  return <svg ref={svgRef} width={200} height={200} />;
};

export default DonutChart;
