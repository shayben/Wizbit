import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TenFrame from '../components/common/TenFrame';
import NumberLine from '../components/common/NumberLine';
import ProgressRing from '../components/common/ProgressRing';
import MasteryGrid from '../components/common/MasteryGrid';
import { factGrid, type FactState } from '../services/mathFactService';

describe('TenFrame', () => {
  it('describes the number it shows', () => {
    render(<TenFrame count={7} />);
    expect(screen.getByRole('img', { name: 'Ten frame showing 7' })).toBeInTheDocument();
  });

  it('describes an addition as two groups', () => {
    render(<TenFrame count={3} secondCount={4} />);
    expect(screen.getByRole('img', { name: 'Ten frame showing 3 plus 4' })).toBeInTheDocument();
  });

  it('clamps a count above twenty', () => {
    render(<TenFrame count={99} />);
    expect(screen.getByRole('img', { name: 'Ten frame showing 20' })).toBeInTheDocument();
  });

  it('clamps a negative count to zero', () => {
    render(<TenFrame count={-5} />);
    expect(screen.getByRole('img', { name: 'Ten frame showing 0' })).toBeInTheDocument();
  });

  it('never lets the two groups exceed twenty together', () => {
    render(<TenFrame count={18} secondCount={9} />);
    expect(screen.getByRole('img', { name: 'Ten frame showing 18 plus 2' })).toBeInTheDocument();
  });
});

describe('NumberLine', () => {
  it('describes the range', () => {
    render(<NumberLine min={0} max={10} />);
    expect(screen.getByRole('img', { name: 'Number line from 0 to 10' })).toBeInTheDocument();
  });

  it('describes a jump when one is given', () => {
    render(<NumberLine min={0} max={20} from={7} to={12} />);
    expect(screen.getByRole('img', { name: /jump from 7 to 12/ })).toBeInTheDocument();
  });

  it('tolerates a reversed range', () => {
    render(<NumberLine min={10} max={0} />);
    expect(screen.getByRole('img', { name: 'Number line from 0 to 10' })).toBeInTheDocument();
  });

  it('renders nothing for a zero-width range', () => {
    const { container } = render(<NumberLine min={5} max={5} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('labels the endpoints', () => {
    render(<NumberLine min={0} max={10} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });
});

describe('ProgressRing', () => {
  it('shows the rounded percentage by default', () => {
    render(<ProgressRing percent={66.6} />);
    expect(screen.getByText('67%')).toBeInTheDocument();
  });

  it('clamps out-of-range values', () => {
    render(<ProgressRing percent={140} />);
    expect(screen.getByRole('img', { name: '100 percent' })).toBeInTheDocument();
  });

  it('treats a non-finite percentage as zero', () => {
    render(<ProgressRing percent={Number.NaN} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('shows a caller-supplied label instead of the percentage', () => {
    render(<ProgressRing percent={50} label="2/4" sublabel="today" />);
    expect(screen.getByText('2/4')).toBeInTheDocument();
    expect(screen.getByText('today')).toBeInTheDocument();
  });
});

describe('MasteryGrid', () => {
  const empty: FactState = { srs: {}, stats: {} };

  it('renders the full multiplication table', () => {
    render(<MasteryGrid grid={factGrid(empty, 'mul')} operation="mul" />);
    // 11 body rows (0–10) plus the header row.
    expect(screen.getAllByRole('row')).toHaveLength(12);
  });

  it('lets a child focus one times table from the row header', () => {
    const onFocusFactor = vi.fn();
    render(<MasteryGrid grid={factGrid(empty, 'mul')} operation="mul" onFocusFactor={onFocusFactor} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Practise the 7 times table' })[0]);
    expect(onFocusFactor).toHaveBeenCalledWith(7);
  });

  it('describes itself for screen readers', () => {
    render(<MasteryGrid grid={factGrid(empty, 'mul')} operation="mul" />);
    expect(screen.getByText('Multiplication fact mastery grid')).toBeInTheDocument();
  });
});
