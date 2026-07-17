/**
 * Intelligence Orchestrator — ECO Command Center
 * Runs 5-phase pipeline: Signal → Validate → Supplier → Financial → Execute
 */
import { SignalDetector }          from './signal-detector.js';
import { MarketValidator }         from './market-validator.js';
import { SupplierArchaeologist }   from './supplier-archaeologist.js';
import { FinancialModeler }        from './financial-modeler.js';
import { ExecutionPlanner }        from './execution-planner.js';
import { InferenceEngine }         from './inference-engine.js';

export class IntelligenceOrchestrator {
  constructor(country = 'India') {
    this.country = country;
    this.phases  = [
      { name: 'signal',    handler: new SignalDetector() },
      { name: 'validate',  handler: new MarketValidator() },
      { name: 'supplier',  handler: new SupplierArchaeologist() },
      { name: 'financial', handler: new FinancialModeler() },
      { name: 'execute',   handler: new ExecutionPlanner() },
    ];
  }

  async runPipeline(input) {
    const dossier = { ...input, country: this.country, phases: {}, timestamp: new Date().toISOString() };
    for (const phase of this.phases) {
      console.log(`[Orchestrator] Running phase: ${phase.name}`);
      try {
        dossier.phases[phase.name] = await phase.handler.run(dossier);
      } catch (err) {
        console.error(`[Orchestrator] Phase ${phase.name} failed:`, err.message);
        dossier.phases[phase.name] = { error: err.message, fallback: true };
      }
    }
    dossier.inference = await new InferenceEngine().compute(dossier);
    return dossier;
  }
}
