import fs from 'node:fs/promises';
import path from 'node:path';
import { finalizePresentation } from '/home/alban-byamugisha/.codex/plugins/cache/openai-primary-runtime/presentations/26.1026.10807/skills/presentations/container_tools/artifact_tool_utils.mjs';
process.env.RUNTIME_NODE_MODULES='/home/alban-byamugisha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
process.env.RUNTIME_NODE='/home/alban-byamugisha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node';
const workspaceDir='/home/alban-byamugisha/Desktop/Hostel Maintenance Ticketing System';
const skill='/home/alban-byamugisha/.codex/plugins/cache/openai-primary-runtime/presentations/26.1026.10807/skills/presentations';
const tables=JSON.parse(await fs.readFile(path.join(workspaceDir,'.presentation-build/table-slides.json'),'utf8'));
const result=await finalizePresentation({
 workspaceDir,candidatePath:path.join(workspaceDir,'.presentation-build/candidate-v2.pptx'),
 finalPath:path.join(workspaceDir,'output/presentations/HostelCare_Software_Engineering_Presentation.pptx'),
 pythonExecutable:'/home/alban-byamugisha/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',
 integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),
 layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),
 layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit',...tables.flatMap(n=>['--require-native-table-slide',String(n)])],
 explicitTotalSlideCount:36,requiredNativeTableOwnerSlides:tables,requiredNativeChartOwnerSlides:[],
 fontPolicy:{basis:'design',families:['Lato']},verifyArtifactToolImport:true,
 receiptPath:path.join(workspaceDir,'.presentation-build/validation-delivery.json')
});
console.log(JSON.stringify(result));
