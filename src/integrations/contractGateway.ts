export type ContractResolution = 'COMPLETED' | 'BREACHED' | 'PENDING';

export interface ContractGateway {
  evaluateContract(contractId: string): Promise<ContractResolution>;
}

export class SimulatedContractGateway implements ContractGateway {
  async evaluateContract(contractId: string): Promise<ContractResolution> {
    if (contractId.endsWith('ok')) {
      return 'COMPLETED';
    }

    if (contractId.endsWith('br')) {
      return 'BREACHED';
    }

    return 'PENDING';
  }
}
