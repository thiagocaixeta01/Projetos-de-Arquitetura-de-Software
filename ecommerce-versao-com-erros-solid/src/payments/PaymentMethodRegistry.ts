import { injectable, multiInject } from "inversify";
import { AppError } from "../errors/AppError";
import { IPaymentMethod } from "./IPaymentMethod";
import { TYPES } from "../container/types";

@injectable()
export class PaymentMethodRegistry {
    private methods = new Map<string, IPaymentMethod>();

    constructor( @multiInject(TYPES.PaymentMethod) methods: IPaymentMethod[]){
        methods.forEach((method) => {
            this.methods.set(method.name, method);
        })
    }

    get(name: string): IPaymentMethod {
        const method = this.methods.get(name);

        if (!method) { throw new AppError('Método de pagamento não suportado'); }

        return method;
    }
}