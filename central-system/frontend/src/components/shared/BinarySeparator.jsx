import React from 'react';

export const BinarySeparator = () => {
  return (
    <div className="binary-sep">
      <div className="binary-sep__track">
        {/* Repeating the pattern for seamless scroll */}
        {[...Array(4)].map((_, i) => (
          <React.Fragment key={i}>
            <span>1001011</span>
            <span className="binary-sep__triangle"></span>
            <span>1101001</span>
            <span className="binary-sep__stripe"></span>
            <span>0101010</span>
            <span className="binary-sep__triangle"></span>
            <span>1110010</span>
            <span className="binary-sep__stripe"></span>
            <span>0011011</span>
            <span className="binary-sep__triangle"></span>
            <span>1010101</span>
            <span className="binary-sep__stripe"></span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
