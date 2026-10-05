import cds from "@sap/cds";

/**
 * The error paths log on purpose — those lines are where a rule refusing a
 * request becomes visible in production. In a test run they only print next
 * to a passing test and read like failures, so turn the loggers off.
 */
for (const id of ["hr", "agents", "cds", "sqlite", "odata"]) cds.log(id, "silent");
