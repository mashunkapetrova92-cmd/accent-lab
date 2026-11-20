import Icon from './Icon';

/** Bottom bar of the practice stages: always on screen, so the next step never needs scrolling. */
export default function StepBar({ prev, next, nextLabel, left, unit, onDone, doneLabel }: {
  prev?: () => void; next?: () => void; nextLabel: string; left: number; unit: string; onDone: () => void; doneLabel: string;
}) {
  const ready = left === 0;
  return (
    <div className="step-bar">
      {!ready && <div className="step-need">{`Try ${left} more ${unit}${left === 1 ? '' : 's'} to finish this stage`}</div>}
      <div className="row">
        <button className="btn icon-only" disabled={!prev} onClick={prev} aria-label="Previous"><Icon name="back" /></button>
        {next && <button className={`btn grow${ready ? '' : ' primary'}`} onClick={next}>{nextLabel} <Icon name="next" /></button>}
        {ready && <button className="btn primary grow" onClick={onDone}>{doneLabel} <Icon name="next" /></button>}
        {!next && !ready && <button className="btn grow" disabled>{nextLabel} <Icon name="next" /></button>}
      </div>
    </div>
  );
}
