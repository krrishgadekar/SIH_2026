function outImg = denoiseRetinal(img, method, opts)
% DENOISERETINAL  Edge-preserving denoising for fundus images (Task 2.1b).
%
%   outImg = denoiseRetinal(img)
%   outImg = denoiseRetinal(img, method)
%   outImg = denoiseRetinal(img, method, opts)
%
%   Inputs:
%     img    - HxWx3 uint8 fundus image.
%     method - 'anisotropic' (default) | 'nlm' | 'none'
%     opts   - optional struct:
%                .numIterations []  - anisotropic iterations; default is
%                                    imdiffuseest's own estimate
%                .degreeOfSmoothing []  - non-local means strength
%
%   Output:
%     outImg - HxWx3 uint8, denoised.
%
%   PS requirement 1 names three enhancement steps: "CLAHE, illumination
%   normalization, denoising". The first two existed; this is the third.
%
%   ══ THE CONSTRAINT THAT RULES OUT THE OBVIOUS CHOICES ══════════════════════
%   A microaneurysm is roughly 3-10 pixels across at the resolutions here. It is
%   the SMALLEST thing this system must detect, and it is the earliest sign of
%   DR — the whole reason population screening exists.
%
%   Every standard denoiser removes small isolated dark blobs. That is what
%   denoising IS. medfilt2 with a 3x3 window deletes a 3-pixel microaneurysm
%   outright; a Gaussian blurs it into the background. Such a filter would
%   improve every visual quality metric while destroying the pathology the
%   pipeline exists to find, and nothing downstream would report a problem —
%   the lesion simply would not be there to count.
%
%   So the choice is constrained to EDGE-PRESERVING methods, and the check that
%   matters is not "does it look cleaner" but "do microaneurysm-scale
%   structures survive". verifyDenoise.m measures exactly that.
%
%   'anisotropic' (default) — Perona-Malik diffusion. Smooths WITHIN regions of
%       similar intensity and refuses to smooth ACROSS edges, so a small dark
%       blob surrounded by lighter retina is bounded by edges on all sides and
%       is preserved. Fast enough for the live path.
%
%   'nlm' — non-local means. Better detail preservation, substantially slower.
%       Worth it offline (training-set preparation); too slow per request.
%
%   'none' — pass-through. Not padding: it makes the ablation in Task 9.x a
%       parameter change rather than an edit to the pipeline.
%
%   ── WHERE THIS GOES IN THE CHAIN ───────────────────────────────────────────
%       benGrahamCrop -> denoiseRetinal -> claheEnhance -> illuminationNormalize
%
%   BEFORE claheEnhance, and the order is not arbitrary: CLAHE is a local
%   contrast amplifier, so it amplifies whatever noise it is given. Denoising
%   afterwards would be fighting contrast the previous step deliberately added.
%
%   > CHANGING THIS CHAIN CHANGES WHAT THE MODEL SEES. Any model trained on the
%   > old three-step chain must be retrained, or inference and training diverge
%   > silently (docs/model-handoff-guide.md §2). Coordinate before merging into
%   > the live preprocessing path.

if nargin < 2 || isempty(method), method = 'anisotropic'; end
if nargin < 3, opts = struct(); end

if size(img, 3) ~= 3
    error('denoiseRetinal:badInput', 'Expected an HxWx3 RGB image.');
end

switch lower(method)
    case 'none'
        outImg = img;
        return;

    case 'anisotropic'
        % Per channel: fundus noise is not identical across R/G/B (the green
        % channel carries the most vessel/lesion signal and the most noise), and
        % diffusing a combined luminance would let one channel's edges dictate
        % smoothing in the others.
        nOverride = getdef(opts, 'numIterations', []);
        outImg = zeros(size(img), 'like', img);
        for c = 1:3
            ch = im2double(img(:,:,c));

            % Gradient threshold estimated from the channel's own statistics
            % rather than a fixed constant, so the same call works on a bright
            % well-exposed image and a dim one.
            %
            % imdiffuseest returns a VECTOR of thresholds — one per iteration —
            % together with its own suggested iteration count, and
            % imdiffusefilt requires the two lengths to match. Passing the
            % vector alongside a hand-picked NumberOfIterations errors with
            % "Length of the GradientThreshold vector should be the same as
            % NumberOfIterations".
            [gradThresh, nEst] = imdiffuseest(ch, 'ConductionMethod', 'quadratic');

            if isempty(nOverride)
                % Use the estimator's own pairing, which is self-consistent.
                n = nEst;
                thresh = gradThresh;
            else
                % Caller fixed the iteration count, so the per-iteration
                % schedule no longer applies. Collapse to a single scalar
                % threshold, which imdiffusefilt accepts for any n.
                n = nOverride;
                thresh = median(gradThresh);
            end

            outImg(:,:,c) = im2uint8(imdiffusefilt(ch, ...
                'GradientThreshold', thresh, 'NumberOfIterations', n, ...
                'ConductionMethod', 'quadratic'));
        end

    case 'nlm'
        outImg = zeros(size(img), 'like', img);
        for c = 1:3
            ch = im2double(img(:,:,c));
            dos = getdef(opts, 'degreeOfSmoothing', []);
            if isempty(dos)
                outImg(:,:,c) = im2uint8(imnlmfilt(ch));
            else
                outImg(:,:,c) = im2uint8(imnlmfilt(ch, 'DegreeOfSmoothing', dos));
            end
        end

    otherwise
        error('denoiseRetinal:badMethod', ...
              'method must be ''anisotropic'', ''nlm'' or ''none'' — got ''%s''.', method);
end
end

function v = getdef(s, name, dflt)
if isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end
