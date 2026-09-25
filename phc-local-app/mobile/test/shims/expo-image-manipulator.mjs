// Not exercised in Node (image decoding is covered by the MATLAB parity test).
export const SaveFormat = { JPEG: 'jpeg', PNG: 'png' };
export const ImageManipulator = {
  manipulate() { throw new Error('expo-image-manipulator is not available under Node tests'); },
};
