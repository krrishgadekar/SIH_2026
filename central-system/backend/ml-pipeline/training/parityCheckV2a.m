function parityCheckV2a()
% PARITYCHECKV2A  branchA_v2a's entry point -- thin wrapper over the
% generalized parityCheckV2('branchA_v2a') (GENERALIZE, v2b integration).
% Behaviour and output are byte-identical to before this generalization. A
% SEPARATE file from parityCheck.m -- v1's entries there are not touched.
% See parityCheckV2.m for the shared implementation and parityCheckV2b.m for
% the sibling v2b entry point.
parityCheckV2('branchA_v2a');
end
