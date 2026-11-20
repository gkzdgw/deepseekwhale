export const defaultGestationMinutes=24*60
export const validGestationMinutes=value=>Number.isInteger(value) && value>=1 && value<=365*24*60
