import { injectable } from "inversify";
import { IMailProvider } from "./IMailProvider";

@injectable()
export class ConsoleMailProvider implements IMailProvider {
    async sendMail(data: { to: string; subject: string; text: string; html: string; }): Promise<string | null> {
        console.log('--- E-mail (modo teste) ---');
        console.log('Para: ', data.to);
        console.log('Assunto: ', data.subject);
        console.log('Texto: ', data.text);

        return null;
    }
}