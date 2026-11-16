import {type ChildProcess} from 'child_process';

const activeProcesses = new Map<string, ChildProcess>();
const resetProcessTimeouts = new Map<string, () => void>();

export {activeProcesses, resetProcessTimeouts};
