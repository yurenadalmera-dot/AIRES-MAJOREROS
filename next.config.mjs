/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },

  // Marca de cuándo se compiló esto, para saber qué versión está viva.
  //
  // Hostinger construye por su cuenta al recibir un push y a veces falla sin
  // dejar ni una línea de log; cuando eso pasa, el sitio sigue sirviendo la
  // versión anterior y nada lo delata. Con esta marca, `/api/health/db` dice
  // de cuándo es lo que está corriendo, y la comprobación posterior al
  // despliegue puede exigir que sea más nueva que el push.
  //
  // `env` se sustituye en la compilación, así que el valor queda congelado en
  // el código generado: no es la hora de arranque, es la de compilación.
  env: { COMPILADO_EN: new Date().toISOString() },
};

export default nextConfig;
