
// src/components/RubricCard.tsx
import React from 'react';
type Item = { name: string; max: number };
type Score = { name: string; score: number; reason: string };

export function RubricCard({ items, scores }: { items: Item[]; scores?: Score[] }) {
  return (
    <div className="p-4 rounded-2xl shadow space-y-3">
      <div className="text-lg font-semibold">Rubric</div>
      <ul className="space-y-2">
        {items.map(it => {
          const sc = scores?.find(s => s.name === it.name);
          return (
            <li key={it.name} className="flex justify-between items-start">
              <div>
                <div className="font-medium">{it.name}</div>
                {sc?.reason && <div className="text-sm text-gray-600">{sc.reason}</div>}
              </div>
              <div className="text-right">
                <div className="text-xl">{sc ? `${sc.score}/${it.max}` : `0/${it.max}`}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
