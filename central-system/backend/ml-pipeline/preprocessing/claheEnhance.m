function outImg = claheEnhance(img, clipLimit)
% CLAHEENHANCE  Apply CLAHE to the L channel of a fundus image.
%
%   outImg = claheEnhance(img)
%   outImg = claheEnhance(img, clipLimit)
%
%   Inputs:
%     img        - HxWx3 uint8 RGB image.
%     clipLimit  - optional CLAHE clip limit in [0,1] (default 0.01).
%                  Lower values = less aggressive contrast enhancement.
%                  0.01 is conservative for fundus images — the retinal
%                  vasculature has genuine low-contrast regions that should
%                  not be over-enhanced.
%
%   Output:
%     outImg - HxWx3 uint8 RGB image, contrast-enhanced.
%
%   Why LAB and not direct RGB/greyscale CLAHE:
%     Applying CLAHE to RGB channels independently shifts hue and
%     introduces colour artefacts.  LAB separates luminance (L) from
%     chrominance (A, B), so CLAHE on L alone preserves the original
%     fundus colour — important for lesion-colour cues used by both
%     the grading CNN and the ophthalmologist reviewer.

if nargin < 2 || isempty(clipLimit)
    clipLimit = 0.01;
end

% Step 1 — convert to LAB colour space
labImg = rgb2lab(img);

% Step 2 — extract L channel and normalise to [0,1] for adapthisteq
%   LAB L channel range is [0, 100]; adapthisteq expects [0,1].
L = labImg(:,:,1) / 100;

% Step 3 — CLAHE on L channel only
L_enhanced = adapthisteq(L, 'ClipLimit', clipLimit);

% Step 4 — put enhanced L back and convert to RGB
labImg(:,:,1) = L_enhanced * 100;
outImg = lab2rgb(labImg);

% Step 5 — clamp and convert to uint8
outImg = uint8(max(0, min(255, outImg * 255)));

end
