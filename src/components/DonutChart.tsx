import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface DonutChartProps {
  data: Record<string, number>;
  colors?: Record<string, string>;
}

interface ChartItem {
  key: string;
  value: number;
}

const DonutChart: React.FC<DonutChartProps> = ({ data, colors }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredItem, setHoveredItem] = useState<{ label: string; value: number; percent: number } | null>(null);

  const total: number = (Object.values(data) as any[]).reduce((sum: number, val: any): number => sum + Number(val), 0);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = 180;
    const height = 180;
    const radius = Math.min(width, height) / 2;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.append('g').attr('transform', `translate(${width / 2}, ${height / 2})`);

    const pie = d3.pie<ChartItem>()
      .sort(null)
      .value((d) => d.value);

    const arc = d3.arc<d3.PieArcDatum<ChartItem>>()
      .innerRadius(radius * 0.6)
      .outerRadius(radius * 0.95);

    const hoverArc = d3.arc<d3.PieArcDatum<ChartItem>>()
      .innerRadius(radius * 0.6)
      .outerRadius(radius * 1.02);

    const formattedData: ChartItem[] = Object.entries(data)
      .map(([key, value]) => ({ key, value: Number(value) }))
      .filter((d) => d.value > 0);

    const arcs = pie(formattedData);

    const defaultColors: Record<string, string> = {
      'COMPLETED': '#10b981',
      'DRAFT': '#94a3b8',
      'IN_PROGRESS': '#3b82f6',
      'PENDING': '#64748b',
      'DEPARTED': '#10b981',
      'NO_SHOW': '#ef4444',
      'RESCHEDULED': '#f59e0b',
      'CANCELLED': '#ec4899'
    };

    const colorScale = d3.scaleOrdinal<string>()
      .domain(formattedData.map(d => d.key))
      .range(formattedData.map(d => colors?.[d.key] || defaultColors[d.key] || '#cbd5e1'));

    // Draw slices with animation
    const path = g.selectAll('path')
      .data(arcs)
      .enter()
      .append('path')
      .attr('d', arc as any)
      .attr('fill', (d) => colorScale(d.data.key))
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 2.5)
      .style('cursor', 'pointer')
      .style('transition', 'all 0.2s ease');

    // Transitions
    path.transition()
      .duration(800)
      .attrTween('d', function (d) {
        const interpolate = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
        return function (t) {
          return arc(interpolate(t) as any) as string;
        };
      });

    // Interaction handlers
    path.on('mouseenter', function (event, d) {
      d3.select(this)
        .transition()
        .duration(150)
        .attr('d', hoverArc as any);

      const percent = total > 0 ? (d.data.value / total) * 100 : 0;
      setHoveredItem({
        label: d.data.key,
        value: d.data.value,
        percent
      });
    });

    path.on('mouseleave', function () {
      d3.select(this)
        .transition()
        .duration(150)
        .attr('d', arc as any);
      setHoveredItem(null);
    });

  }, [data, colors, total]);

  // Generate beautiful legend
  const defaultColors: Record<string, string> = {
    'COMPLETED': '#10b981',
    'DRAFT': '#64748b',
    'IN_PROGRESS': '#3b82f6',
    'PENDING': '#64748b',
    'DEPARTED': '#10b981',
    'NO_SHOW': '#ef4444',
    'RESCHEDULED': '#f59e0b',
    'CANCELLED': '#ec4899'
  };

  const formatLabel = (lbl: string) => {
    return lbl.replace('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4 w-full">
      <div className="relative w-[180px] h-[180px] shrink-0">
        <svg ref={svgRef} width={180} height={180} className="overflow-visible" />
        
        {/* Center label inside the Donut Chart */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none text-center">
          <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400 leading-none">
            {hoveredItem ? formatLabel(hoveredItem.label) : 'Total Tickets'}
          </span>
          <span className="text-xl font-black text-slate-800 mt-1 leading-none">
            {hoveredItem ? hoveredItem.value : total}
          </span>
          <span className="text-[9px] font-bold text-slate-400 mt-0.5 leading-none">
            {hoveredItem ? `${hoveredItem.percent.toFixed(1)}%` : '100%'}
          </span>
        </div>
      </div>

      {/* Modern Legend Grid */}
      <div className="w-full flex flex-col gap-1 px-1">
        {Object.entries(data).map(([key, rawVal]) => {
          const val = Number(rawVal);
          const color = colors?.[key] || defaultColors[key] || '#cbd5e1';
          const percent = total > 0 ? (val / total) * 100 : 0;
          const isCurrentHover = hoveredItem?.label === key;
          
          return (
            <div 
              key={key} 
              className={`flex items-center justify-between p-1 px-2 rounded-lg border transition-all duration-200 ${
                isCurrentHover 
                  ? 'bg-slate-50 border-slate-200 shadow-3xs scale-[1.01]' 
                  : 'bg-transparent border-transparent'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className={`text-xs font-semibold ${isCurrentHover ? 'text-slate-800 font-extrabold' : 'text-slate-600'}`}>
                  {formatLabel(key)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <span className="font-extrabold text-slate-700">{val}</span>
                <span className="text-slate-400">({percent.toFixed(0)}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DonutChart;
