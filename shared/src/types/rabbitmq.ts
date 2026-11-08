type ControlAction = 'stdin' | 'cancel';

const isControlAction = (value: string | undefined): value is ControlAction => {
  return value === 'stdin' || value === 'cancel';
};

export type {ControlAction};

export {isControlAction};
