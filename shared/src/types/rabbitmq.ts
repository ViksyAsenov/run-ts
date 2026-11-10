type ControlAction = 'stdin' | 'cancel';
type JobStatus = 'submitted' | 'compiling' | 'failed' | 'executing' | 'finished';

const isControlAction = (value: string | undefined): value is ControlAction => {
  return value === 'stdin' || value === 'cancel';
};

const isJobStatus = (value: string): value is JobStatus => {
  return (
    value === 'submitted' ||
    value === 'compiling' ||
    value === 'failed' ||
    value === 'executing' ||
    value === 'finished'
  );
};

export type {ControlAction, JobStatus};

export {isControlAction, isJobStatus};
