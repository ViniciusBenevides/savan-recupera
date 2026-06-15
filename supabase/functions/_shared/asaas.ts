// SAVAN Recupera — cliente Asaas (sandbox/produção) com split
export class Asaas {
  private base: string;
  constructor(private apiKey: string, ambiente: "sandbox" | "producao") {
    this.base = ambiente === "producao"
      ? "https://api.asaas.com/v3"
      : "https://api-sandbox.asaas.com/v3";
  }

  private h() {
    return {
      "access_token": this.apiKey,
      "Content-Type": "application/json",
      "User-Agent": "SAVAN-Recupera",
    };
  }

  async acharOuCriarCliente(p: {
    nome: string; cpfCnpj: string; mobilePhone?: string; externalReference: string;
  }): Promise<string> {
    // tenta achar por externalReference
    const busca = await fetch(
      `${this.base}/customers?externalReference=${encodeURIComponent(p.externalReference)}`,
      { headers: this.h() },
    );
    const bd = await busca.json();
    if (bd?.data?.length) return bd.data[0].id;

    const r = await fetch(`${this.base}/customers`, {
      method: "POST",
      headers: this.h(),
      body: JSON.stringify({
        name: p.nome,
        cpfCnpj: p.cpfCnpj,
        mobilePhone: p.mobilePhone,
        externalReference: p.externalReference,
        notificationDisabled: true,
      }),
    });
    const d = await r.json();
    if (!d?.id) throw new Error("asaas_customer: " + JSON.stringify(d));
    return d.id;
  }

  async criarPix(p: {
    customer: string; value: number; dueDate: string; externalReference: string;
    description: string; walletSavan?: string; comissaoPct: number;
  }) {
    const body: any = {
      customer: p.customer,
      billingType: "PIX",
      value: p.value,
      dueDate: p.dueDate,
      externalReference: p.externalReference,
      description: p.description,
    };
    // split: o percentual do SAVAN vai para a wallet dele; a comissão fica na conta emissora
    if (p.walletSavan) {
      body.split = [{
        walletId: p.walletSavan,
        percentualValue: 100 - p.comissaoPct,
      }];
    }
    const r = await fetch(`${this.base}/payments`, {
      method: "POST",
      headers: this.h(),
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!d?.id) throw new Error("asaas_payment: " + JSON.stringify(d));
    return d;
  }

  async pixQrCode(paymentId: string) {
    const r = await fetch(`${this.base}/payments/${paymentId}/pixQrCode`, { headers: this.h() });
    return await r.json(); // { encodedImage, payload, expirationDate }
  }

  async getPagamento(paymentId: string) {
    const r = await fetch(`${this.base}/payments/${paymentId}`, { headers: this.h() });
    return await r.json();
  }
}
