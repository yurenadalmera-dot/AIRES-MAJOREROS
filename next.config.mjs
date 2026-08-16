/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // En modo demo la base de datos sembrada se lee en tiempo de ejecución, así
  // que hay que incluirla explícitamente en el bundle: el rastreo automático de
  // dependencias no la detecta porque no se importa, se abre por ruta.
  outputFileTracingIncludes: {
    "/**": ["./prisma/preview-seed.db"],
  },
};

export default nextConfig;
