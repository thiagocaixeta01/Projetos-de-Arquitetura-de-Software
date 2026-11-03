export interface IPaymentMethod {
    readonly name: string;
    process(amount: number, details?: any): Promise<void>;
}