import React, { useState, useEffect } from 'react';

const MESSAGES = [
  'INITIALIZING SYSTEM...',
  'CONNECTING TO CENTRAL CLOUD...',
  'CHECKING DEVICE CALIBRATION...',
  'PIPELINE OPTIMAL',
  'MODEL v4.2 READY',
  'AWAITING CAPTURE SEQUENCE...'
];

export const ConsoleStatus = () => {
  const [msgIndex, setMsgIndex] = useState(0);
  const [text, setText] = useState('');
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    let timeout;
    const currentMsg = MESSAGES[msgIndex];

    if (isTyping) {
      if (text.length < currentMsg.length) {
        timeout = setTimeout(() => {
          setText(currentMsg.slice(0, text.length + 1));
        }, 50 + Math.random() * 50);
      } else {
        timeout = setTimeout(() => setIsTyping(false), 2000); // Wait before clearing
      }
    } else {
      if (text.length > 0) {
        timeout = setTimeout(() => {
          setText(text.slice(0, -1));
        }, 20); // Fast delete
      } else {
        setMsgIndex((prev) => (prev + 1) % MESSAGES.length);
        setIsTyping(true);
      }
    }

    return () => clearTimeout(timeout);
  }, [text, isTyping, msgIndex]);

  return (
    <div className="console">
      <span className="console__line">{text}</span>
    </div>
  );
};
