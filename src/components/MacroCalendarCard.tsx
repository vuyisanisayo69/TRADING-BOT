import React from 'react';
import type { EconomicEvent } from '../utils/marketData.ts';

interface MacroCalendarCardProps {
  events: EconomicEvent[];
}

export const MacroCalendarCard: React.FC<MacroCalendarCardProps> = ({ events }) => {
  return (
    <div className="bg-[#0e1424] rounded-xl border border-slate-800 p-3 shadow-xl">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80">
        <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
          MACRO CATALYST CALENDAR
        </span>
        <span className="text-[10px] font-mono text-amber-400 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-800/50">
          HIGH IMPACT RISKS
        </span>
      </div>

      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
        {events.map((ev) => (
          <div
            key={ev.id}
            className="p-2 rounded bg-[#12192c] border border-slate-800 text-[11px] font-mono flex items-center justify-between"
          >
            <div>
              <div className="flex items-center gap-1.5 font-bold text-slate-200">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    ev.impact === 'HIGH' ? 'bg-rose-400' : 'bg-amber-400'
                  }`}
                ></span>
                <span>{ev.currency}</span>
                <span>{ev.event}</span>
              </div>
              <div className="text-[10px] text-slate-400">
                Fcst: {ev.forecast} | Prev: {ev.previous}
              </div>
            </div>
            <div className="text-right text-[10px] font-semibold text-cyan-300">{ev.time}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
