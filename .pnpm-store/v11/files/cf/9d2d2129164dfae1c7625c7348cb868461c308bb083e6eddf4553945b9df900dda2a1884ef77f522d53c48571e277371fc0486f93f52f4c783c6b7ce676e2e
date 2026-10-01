"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteFunctionsByEndpointFilters = deleteFunctionsByEndpointFilters;
const backend = require("./backend");
const planner = require("./release/planner");
const executor = require("./release/executor");
const fabricator = require("./release/fabricator");
const functionsDeployHelper_1 = require("./functionsDeployHelper");
const getProjectNumber_1 = require("../../getProjectNumber");
const reporter = require("./release/reporter");
const error_1 = require("../../error");
const functional_1 = require("../../functional");
const prompt_1 = require("../../prompt");
const functionsConfig = require("../../functionsConfig");
async function deleteFunctionsByEndpointFilters(context, options) {
    let haveBackend = await backend.existingBackend(context);
    if (options?.region) {
        haveBackend = backend.matchingBackend(haveBackend, (endpoint) => endpoint.region === options.region);
    }
    const plan = await planner.createDeploymentPlan({
        wantBackend: backend.empty(),
        haveBackend: haveBackend,
        codebase: "",
        projectId: context.projectId,
        filters: context.filters,
        deleteAll: true,
    });
    const allEpToDelete = Object.values(plan.regionalChangesets)
        .map((changes) => changes.endpointsToDelete)
        .reduce(functional_1.reduceFlat, [])
        .sort(backend.compareFunctions);
    if (allEpToDelete.length === 0) {
        return 0;
    }
    const deleteList = allEpToDelete.map((func) => `\t${(0, functionsDeployHelper_1.getFunctionLabel)(func)}`).join("\n");
    const confirmDeletion = await (0, prompt_1.confirm)({
        message: "You are about to delete the following Cloud Functions:\n" + deleteList + "\n  Are you sure?",
        default: false,
        force: options?.force,
        nonInteractive: options?.nonInteractive,
    });
    if (!confirmDeletion) {
        throw new error_1.FirebaseError("Command aborted.");
    }
    const functionExecutor = new executor.QueueExecutor({
        retries: 30,
        backoff: 20000,
        concurrency: 40,
        maxBackoff: 40000,
    });
    try {
        const firebaseConfig = await functionsConfig.getFirebaseConfig({
            ...options,
            projectId: context.projectId,
        });
        const appEngineLocation = functionsConfig.getAppEngineLocation(firebaseConfig);
        const fab = new fabricator.Fabricator({
            functionExecutor,
            runFunctionExecutor: functionExecutor,
            appEngineLocation,
            executor: new executor.QueueExecutor({}),
            sources: {},
            projectNumber: await (0, getProjectNumber_1.getProjectNumber)({ projectId: context.projectId }),
            projectId: context.projectId,
        });
        const summary = await fab.applyPlan({ default: plan });
        await reporter.logAndTrackDeployStats(summary);
        reporter.printErrors(summary);
        if (summary.results.some((r) => r.error)) {
            throw new error_1.FirebaseError("At least one functions deletion operation failed.");
        }
        return allEpToDelete.length;
    }
    catch (err) {
        throw new error_1.FirebaseError(`Failed to delete functions: ${err}`, {
            original: err,
            exit: 1,
        });
    }
}
