const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient().$extends({
  query: {
    user: {
      async $allOperations({ operation, args, query }) {
        const result = await query(args);

        // If password explicitly selected, return raw result
        if (args?.select?.password || args?.include?.password) {
          return result;
        }

        const removeSensitive = (user) => {
          if (!user) return user;

          const sanitized = { ...user };

          delete sanitized.password;
          delete sanitized.resetToken;
          delete sanitized.resetExpires;
          delete sanitized.inviteToken;
          delete sanitized.inviteExpires;

          return sanitized;
        };

        if (Array.isArray(result)) {
          return result.map(removeSensitive);
        }

        return removeSensitive(result);
      },
    },
  },
});

module.exports = prisma;
