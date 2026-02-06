// Setup for Supabase Edge Functions
// Usando pdf-lib que es compatible con Deno 2

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const { documentId, pdfBase64, signerName } = await req.json();

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // Obtener Config
        const { data: settings } = await supabaseAdmin
            .from('admin_settings')
            .select('value')
            .eq('key', 'kms_config')
            .single();

        if (!settings?.value?.enabled) throw new Error("KMS no habilitado");
        const config = settings.value;

        // Decodificar PDF
        const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
        
        // Cargar PDF con pdf-lib
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
        
        // Agregar página de firma o usar la última
        const pages = pdfDoc.getPages();
        const lastPage = pages[pages.length - 1];
        const { width, height } = lastPage.getSize();
        
        // Agregar texto de firma digital
        const signatureText = [
            `Documento firmado digitalmente`,
            `Firmante: ${signerName}`,
            `Fecha: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`,
            `Razón: ${config.reason || "Firma Digital Unicesar"}`,
            `Ubicación: ${config.signingLocation || "Colombia"}`,
            `ID Documento: ${documentId}`
        ];
        
        const boxX = 50;
        const boxY = 50;
        const boxWidth = 300;
        const boxHeight = 90;
        
        // Dibujar caja de firma
        lastPage.drawRectangle({
            x: boxX,
            y: boxY,
            width: boxWidth,
            height: boxHeight,
            borderColor: rgb(0, 0.3, 0.6),
            borderWidth: 1.5,
            color: rgb(0.95, 0.97, 1),
        });
        
        // Agregar texto de firma
        let yPos = boxY + boxHeight - 15;
        for (const line of signatureText) {
            lastPage.drawText(line, {
                x: boxX + 10,
                y: yPos,
                size: 8,
                font: helveticaFont,
                color: rgb(0, 0.2, 0.4),
            });
            yPos -= 12;
        }
        
        // Guardar PDF modificado
        const signedBytes = await pdfDoc.save();

        // Actualizar DB solo si documentId es un UUID válido
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (documentId && uuidRegex.test(documentId)) {
            await supabaseAdmin
                .from('documents')
                .update({
                    status: 'firmado',
                    metadata: {
                        signed_at: new Date().toISOString(),
                        signer_name: signerName,
                        signature_type: 'visual'
                    }
                })
                .eq('id', documentId);
        }

        // Convertir a Base64
        const binary = Array.from(signedBytes).map(b => String.fromCharCode(b)).join('');
        const base64 = btoa(binary);

        return new Response(JSON.stringify({ 
            signedPdfBase64: base64,
            message: "PDF firmado con marca visual. Para firma criptográfica con KMS, se requiere librería compatible con Deno 2."
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        });

    } catch (error: any) {
        console.error("Error en Edge Function:", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        });
    }
});
