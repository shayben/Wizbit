/**
 * MasteryGrid — the fact table as a fill-in-the-grid campaign.
 *
 * Turns "practise your times tables" into a visible target: 121 cells that
 * change colour as facts become fluent. Tapping a row focuses the drill on
 * that times table.
 */

import React from 'react';
import {
  FACT_TABLES,
  operationMeta,
  type FactMastery,
  type FactOperation,
} from '../../services/mathFactService';
import { LEVEL_STYLE } from './masteryLegend';

export interface MasteryGridProps {
  grid: FactMastery[][];
  operation: FactOperation;
  /** Called with the chosen factor when a header cell is tapped. */
  onFocusFactor?: (factor: number) => void;
}

const MasteryGrid: React.FC<MasteryGridProps> = ({ grid, operation, onFocusFactor }) => {
  const { min } = FACT_TABLES[operation];
  const { symbol } = operationMeta(operation);

  return (
    <div className="w-full overflow-x-auto">
      <table className="border-separate border-spacing-0.5 mx-auto">
        <caption className="sr-only">
          {operationMeta(operation).label} fact mastery grid
        </caption>
        <thead>
          <tr>
            <th scope="col" className="w-7 h-7 md:w-8 md:h-8 text-xs font-extrabold text-gray-400">
              {symbol}
            </th>
            {grid[0]?.map((_, columnIndex) => {
              const factor = min + columnIndex;
              return (
                <th key={factor} scope="col" className="p-0">
                  <button
                    type="button"
                    onClick={() => onFocusFactor?.(factor)}
                    className="w-7 h-7 md:w-8 md:h-8 rounded text-xs font-extrabold text-gray-500
                               active:bg-violet-100 transition-colors"
                    aria-label={`Practise the ${factor} times table`}
                  >
                    {factor}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, rowIndex) => {
            const factor = min + rowIndex;
            return (
              <tr key={factor}>
                <th scope="row" className="p-0">
                  <button
                    type="button"
                    onClick={() => onFocusFactor?.(factor)}
                    className="w-7 h-7 md:w-8 md:h-8 rounded text-xs font-extrabold text-gray-500
                               active:bg-violet-100 transition-colors"
                    aria-label={`Practise the ${factor} times table`}
                  >
                    {factor}
                  </button>
                </th>
                {row.map((cell, columnIndex) => {
                  const style = LEVEL_STYLE[cell.level];
                  return (
                    <td key={cell.factId} className="p-0">
                      <span
                        title={`${factor} ${symbol} ${min + columnIndex} — ${style.title}`}
                        className={`block w-7 h-7 md:w-8 md:h-8 rounded text-[10px] md:text-xs
                                    grid place-items-center font-bold ${style.cell}`}
                      >
                        {cell.level === 'fluent' ? '★' : ''}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default MasteryGrid;
