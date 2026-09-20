function s = jsonencodeAscii(value, varargin)
% JSONENCODEASCII  jsonencode, with every non-ASCII character escaped as \uXXXX.
%
%   s = jsonencodeAscii(value)
%   s = jsonencodeAscii(value, Name, Value)   % same options as jsonencode
%
% WHY: the backend reads MATLAB's JSON from `matlab -batch` STDOUT. On Windows
% that stream is written in the system ANSI code page, not UTF-8, so any
% character outside it is silently DROPPED. The evidence and rule-engine text
% uses em dashes ("—") throughout, and 20 of 33 stored evidence summaries were
% found with the dash missing ("assessed  no detector exists"). Nothing errors;
% the text is just quietly wrong.
%
% A \uXXXX escape is plain ASCII, survives any code page, and JSON.parse turns
% it back into the original character, so the text arrives intact. MATLAB char
% is UTF-16, so characters beyond the BMP are already surrogate pairs and each
% half is escaped separately -- which is exactly what JSON expects.
%
% Use this -- not jsonencode -- for any JSON that crosses into Node.

s = jsonencode(value, varargin{:});
codes = double(s);
hi = find(codes > 127);
if isempty(hi), return; end

pieces = cell(1, 2 * numel(hi) + 1);
prev = 1;
k = 0;
for i = 1:numel(hi)
    j = hi(i);
    k = k + 1; pieces{k} = s(prev:j-1);
    k = k + 1; pieces{k} = sprintf('\\u%04x', codes(j));
    prev = j + 1;
end
k = k + 1; pieces{k} = s(prev:end);
s = [pieces{1:k}];
end
