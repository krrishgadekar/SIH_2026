function runParityCaptureV2a()
% RUNPARITYCAPTUREV2A  branchA_v2a's entry point -- thin wrapper over the
% generalized runParityCaptureV2('branchA_v2a') (GENERALIZE, v2b
% integration). Output path (diagnostics/out/parity_v2a_report.txt) and
% behaviour are byte-identical to before this generalization. See
% runParityCaptureV2.m for the shared implementation and
% runParityCaptureV2b.m for the sibling v2b entry point.
runParityCaptureV2('branchA_v2a');
end
