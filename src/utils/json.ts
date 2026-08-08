export const safeStringify = (data: any, space?: string | number): string => {
  return JSON.stringify(
    data,
    (_, v) => (typeof v === 'bigint' ? v.toString() : v),
    space
  );
};
