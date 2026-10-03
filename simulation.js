// All signals, traffic and crossings read the same simulation clock.
export const SIGNAL={green:28,amber:3,clearance:2};
const half=SIGNAL.green+SIGNAL.amber+SIGNAL.clearance;
export function signalState(time,axis){
  const t=((time-axis*half)%(half*2)+half*2)%(half*2);
  const phase=t<SIGNAL.green?'green':t<SIGNAL.green+SIGNAL.amber?'amber':'red';
  const remaining=phase==='green'?SIGNAL.green-t:phase==='amber'?SIGNAL.green+SIGNAL.amber-t:half*2-t;
  return {phase,remaining,code:phase==='green'?0:phase==='amber'?1:2};
}
export function mayCross(time,vehicleAxis,secondsNeeded){
  const parallel=signalState(time,1-vehicleAxis);
  return signalState(time,vehicleAxis).phase==='red'&&parallel.phase==='green'&&parallel.remaining>secondsNeeded+2;
}
