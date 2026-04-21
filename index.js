export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const workerClient = {
        // Função para sistema real
        async runRealAutomation(request) {
          try {
            const body = await request.json();
            console.log("🚀 Worker: Executando sistema real", body);

            const response = await fetch("https://constituicao-bot.onrender.com/run-real-automation", {
              method: "POST",
              headers: { 
                "Content-Type": "application/json",
                "User-Agent": "Worker-Client/1.0"
              },
              body: JSON.stringify(body)
            });

            const data = await response.json();
            console.log("✅ Worker: Resposta do sistema real", data);

            return new Response(JSON.stringify(data), {
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            });

          } catch (error) {
            console.error("❌ Worker: Erro no sistema real", error);
            
            return new Response(JSON.stringify({ 
              ok: false, 
              message: `Worker error: ${error.message}`,
              tipo: "erro_worker"
            }), {
              status: 500,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            });
          }
        },

        // Função para automação híbrida (mantida para compatibilidade)
        async runAutomation(request) {
          try {
            const body = await request.json();
            
            const response = await fetch("https://constituicao-bot.onrender.com/run-automation", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body)
            });

            const data = await response.json();

            return new Response(JSON.stringify(data), {
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            });

          } catch (error) {
            return new Response(JSON.stringify({ 
              ok: false, 
              message: error.message 
            }), {
              status: 500,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            });
          }
        },

        // Função para verificar login (mantida para compatibilidade)
        async checkLogin(request) {
          try {
            const body = await request.json();
            
            const response = await fetch("https://constituicao-bot.onrender.com/check-login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body)
            });

            const data = await response.json();

            return new Response(JSON.stringify(data), {
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            });

          } catch (error) {
            return new Response(JSON.stringify({ 
              ok: false, 
              message: error.message 
            }), {
              status: 500,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            });
          }
        },

        // Função para continuar automação (mantida para compatibilidade)
        async continueAutomation(request) {
          try {
            const body = await request.json();
            
            const response = await fetch("https://constituicao-bot.onrender.com/continue", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body)
            });

            const data = await response.json();

            return new Response(JSON.stringify(data), {
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            });

          } catch (error) {
            return new Response(JSON.stringify({ 
              ok: false, 
              message: error.message 
            }), {
              status: 500,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            });
          }
        }
      };

      // Roteamento
      const path = url.pathname;
      
      switch (path) {
        // NOVO ENDPOINT PRINCIPAL - Sistema Real
        case '/run-real-automation':
          return await workerClient.runRealAutomation(request);
          
        // Endpoints mantidos para compatibilidade
        case '/run-automation':
          return await workerClient.runAutomation(request);
          
        case '/check-login':
          return await workerClient.checkLogin(request);
          
        case '/continue-automation':
          return await workerClient.continueAutomation(request);
          
        // Health check
        case '/':
        case '/health':
          return new Response(JSON.stringify({ 
            status: "Worker ativo",
            version: "sistema-real-v1",
            endpoints: [
              "/run-real-automation (PRINCIPAL)",
              "/run-automation (compatibilidade)",
              "/check-login (compatibilidade)",
              "/continue-automation (compatibilidade)"
            ],
            timestamp: new Date().toISOString()
          }), {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          });
          
        default:
          return new Response(JSON.stringify({ 
            error: "Endpoint não encontrado",
            path: path,
            available_endpoints: [
              "/run-real-automation",
              "/run-automation", 
              "/check-login",
              "/continue-automation"
            ]
          }), {
            status: 404,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          });
      }

    } catch (error) {
      console.error("❌ Worker: Erro geral", error);
      
      return new Response(JSON.stringify({ 
        error: "Erro interno do worker",
        message: error.message,
        timestamp: new Date().toISOString()
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }
  },
};
